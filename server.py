#!/usr/bin/env python3
"""Focus Builder local helper.

Serves the app on http://127.0.0.1:47615 and lets it read/write mod folders that a browser
refuses to open (for example anything under Program Files, such as Steam's workshop folder).

Safety:
  * listens on 127.0.0.1 only
  * every API call needs a secret token that is only handed to the app page this server serves
  * Host and Origin headers are checked (blocks other websites and DNS-rebinding)
  * only folders you explicitly open are readable, and only text files (.txt .yml .md .json .mod)
    inside them are writable
  * stops by itself hours after the app window was closed
Standard library only. Start with: pythonw server.py
"""
import http.server, io, json, os, pathlib, re, secrets, subprocess, sys, threading, time, urllib.parse, urllib.request, zipfile

APP_DIR = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get('FB_PORT', '47615'))
TOKEN = secrets.token_urlsafe(24)
HOME = pathlib.Path.home()
DOC_DIRS = [HOME / 'Documents', HOME / 'OneDrive' / 'Documents']
HOI4_MOD_DIRS = [d / 'Paradox Interactive' / 'Hearts of Iron IV' / 'mod' for d in DOC_DIRS]
BACKUP_ROOT = str(DOC_DIRS[0] / 'Focus Builder backups')
WRITE_EXT = {'.txt', '.yml', '.yaml', '.md', '.json', '.mod'}
MAX_BODY = 40 * 1024 * 1024
STATIC_DIRS = {'css', 'js', 'assets', 'tests'}
MIME = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
        '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.json': 'application/json', '.svg': 'image/svg+xml', '.md': 'text/plain; charset=utf-8'}

roots = []            # folders the user opened in the app
ping = {'last': 0.0, 'seen': False}
IDLE_LIMIT = 6 * 3600   # a hidden or minimised window may not ping for a long time


# ---------- updates: every copy checks the app's GitHub repository and can install the newest version ----------
UPDATE_CFG = os.path.join(APP_DIR, 'update.json')          # {"repo": "owner/name", "branch": "main"}
INSTALLED_FILE = os.path.join(APP_DIR, '.installed-version')  # commit of the version that is installed
UPDATE_SKIP = ('.git/', '.installed-version', '__pycache__/')
update_state = {'checked': 0.0, 'result': None, 'busy': False}


def update_config():
    try:
        with open(UPDATE_CFG, encoding='utf-8') as f:
            c = json.load(f)
        repo, branch = str(c.get('repo') or '').strip(), str(c.get('branch') or 'main').strip()
        if re.fullmatch(r'[A-Za-z0-9-]+/[A-Za-z0-9._-]+', repo) and re.fullmatch(r'[A-Za-z0-9._/-]+', branch):
            return repo, branch
    except (OSError, ValueError):
        pass
    return '', 'main'


def github(url, binary=False, limit=60 * 1024 * 1024):
    req = urllib.request.Request(url, headers={'User-Agent': 'Elmo-tool-updater', 'Accept': 'application/vnd.github+json'})
    with urllib.request.urlopen(req, timeout=30) as r:
        data = r.read(limit + 1)
    if len(data) > limit:
        raise ValueError('download too large')
    return data if binary else json.loads(data.decode('utf-8'))


def installed_version():
    try:
        with open(INSTALLED_FILE, encoding='utf-8') as f:
            return f.read().strip()
    except OSError:
        return ''


def check_update(force=False):
    repo, branch = update_config()
    if not repo:
        return {'configured': False}
    if not force and update_state['result'] and time.time() - update_state['checked'] < 1800:
        return update_state['result']
    c = github(f'https://api.github.com/repos/{repo}/commits/{urllib.parse.quote(branch, safe="")}')
    sha = c.get('sha') or ''
    cur = installed_version()
    dev = os.path.isdir(os.path.join(APP_DIR, '.git'))   # the owner's working copy updates itself with git, not here
    res = {'configured': True, 'repo': repo, 'branch': branch, 'current': cur[:7], 'latest': sha[:7], 'sha': sha,
           'available': bool(sha) and sha != cur and not dev, 'dev': dev,
           'message': (c.get('commit') or {}).get('message', '')[:2000], 'date': ((c.get('commit') or {}).get('committer') or {}).get('date', '')}
    update_state.update(checked=time.time(), result=res)
    return res


def install_update(sha):
    repo, branch = update_config()
    if not repo or not re.fullmatch(r'[0-9a-f]{40}', sha or ''):
        raise ValueError('nothing to install')
    if os.path.isdir(os.path.join(APP_DIR, '.git')):
        raise ValueError('this folder is a git working copy; use git pull instead')
    data = github(f'https://codeload.github.com/{repo}/zip/{sha}', binary=True)
    z = zipfile.ZipFile(io.BytesIO(data))
    names = [n for n in z.namelist() if not n.endswith('/')]
    top = names[0].split('/')[0] + '/' if names else ''
    rels = [n[len(top):] for n in names if n.startswith(top)]
    if 'server.py' not in rels or 'index.html' not in rels:
        raise ValueError('the download does not look like Elmo tool')
    base = os.path.realpath(APP_DIR)
    written = 0
    for n in names:
        rel = n[len(top):]
        if not rel or rel.startswith(UPDATE_SKIP) or '..' in rel.split('/') or rel.startswith('/'):
            continue
        target = os.path.realpath(os.path.join(APP_DIR, *rel.split('/')))
        if not target.startswith(base + os.sep):
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        tmp = target + '.fbnew'
        with open(tmp, 'wb') as f:
            f.write(z.read(n))
        os.replace(tmp, target)
        written += 1
    with open(INSTALLED_FILE, 'w', encoding='utf-8') as f:
        f.write(sha)
    update_state.update(checked=0.0, result=None)
    return written


def restart_soon():
    """Starts a fresh helper (with the new files) and stops this one."""
    def go():
        time.sleep(0.6)
        env = dict(os.environ, FB_RESTART='1')
        flags = 0x00000008 | 0x00000200 if os.name == 'nt' else 0   # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        exe = sys.executable
        if os.name == 'nt' and exe.lower().endswith('python.exe') and os.path.exists(exe[:-10] + 'pythonw.exe'):
            exe = exe[:-10] + 'pythonw.exe'
        subprocess.Popen([exe, os.path.join(APP_DIR, 'server.py')], cwd=APP_DIR, env=env, creationflags=flags, close_fds=True)
        os._exit(0)
    threading.Thread(target=go, daemon=True).start()


def norm(p):
    return os.path.normcase(os.path.realpath(p))


def allowed(p):
    rp = norm(p)
    for r in roots + [BACKUP_ROOT]:
        r = norm(r)
        if rp == r or rp.startswith(r + os.sep):
            return True
    return False


def read_descriptor_name(folder):
    try:
        with open(os.path.join(folder, 'descriptor.mod'), encoding='utf-8-sig', errors='replace') as f:
            m = re.search(r'^\s*name\s*=\s*"(.*?)"', f.read(), re.M)
            return m.group(1) if m else os.path.basename(folder)
    except OSError:
        return None


def count_focus_files(folder):
    d = os.path.join(folder, 'common', 'national_focus')
    n = 0
    try:
        for root, dirs, files in os.walk(d):
            if root[len(d):].count(os.sep) >= 4:
                dirs[:] = []
            n += sum(1 for f in files if f.lower().endswith('.txt'))
    except OSError:
        return 0
    return n


def mod_file_path(modfile):
    """The folder a launcher .mod file points at (path= can be relative to the HOI4 user folder)."""
    try:
        txt = pathlib.Path(modfile).read_text(encoding='utf-8-sig', errors='replace')
    except OSError:
        return ''
    m = re.search(r'^\s*path\s*=\s*"(.*?)"', txt, re.M)
    if not m:
        return ''
    target = m.group(1).replace('/', os.sep)
    if not os.path.isabs(target):
        target = os.path.join(os.path.dirname(os.path.dirname(modfile)), target)
    return os.path.normpath(target)


def diagnose(path):
    """Explains why a folder cannot be opened as a mod, and finds the mod folders inside it."""
    p = (path or '').strip().strip('"')
    out = {'path': p, 'exists': os.path.exists(p)}
    if not p or not out['exists']:
        parent = os.path.dirname(p.rstrip('\\/'))
        out['parentExists'] = bool(parent) and os.path.isdir(parent)
        return out
    if os.path.isfile(p):
        ext = os.path.splitext(p)[1].lower()
        out.update(kind='file', ext=ext)
        if ext == '.mod':
            t = mod_file_path(p)
            out['modTarget'] = t
            out['modTargetExists'] = bool(t) and os.path.isdir(t)
        return out
    out['kind'] = 'dir'
    try:
        names = os.listdir(p)
    except PermissionError:
        out['denied'] = True
        return out
    except OSError as e:
        out['error'] = str(e)
        return out
    low = {n.lower(): n for n in names}
    out['hasDescriptor'] = 'descriptor.mod' in low
    out['hasCommon'] = os.path.isdir(os.path.join(p, 'common'))
    out['focusFiles'] = count_focus_files(p)
    out['hasMio'] = os.path.isdir(os.path.join(p, 'common', 'military_industrial_organization', 'organizations'))
    out['zips'] = [n for n in names if n.lower().endswith(('.zip', '.rar', '.7z'))][:5]
    cands, seen = [], set()

    def add(folder, label=None):
        k = os.path.normcase(os.path.realpath(folder))
        if k in seen or not os.path.isdir(folder):
            return
        f = count_focus_files(folder)
        has_desc = os.path.isfile(os.path.join(folder, 'descriptor.mod'))
        if not f and not has_desc:
            return
        seen.add(k)
        cands.append({'name': read_descriptor_name(folder) or label or os.path.basename(folder), 'path': os.path.realpath(folder), 'trees': f})

    for n in sorted(names)[:600]:
        full = os.path.join(p, n)
        if os.path.isdir(full):
            add(full)
            # an unzipped mod often sits one folder deeper (bffu2/bffu2/common)
            try:
                for m in os.listdir(full)[:50]:
                    if os.path.isdir(os.path.join(full, m, 'common')):
                        add(os.path.join(full, m))
            except OSError:
                pass
        elif n.lower().endswith('.mod') and n.lower() != 'descriptor.mod':
            t = mod_file_path(full)
            if t:
                add(t, os.path.splitext(n)[0])
    cands.sort(key=lambda c: (-c['trees'], c['name'].lower()))
    out['candidates'] = cands[:40]
    # a folder inside a mod (common, national_focus, ...): point at the mod root above it
    up = p
    for _ in range(4):
        parent = os.path.dirname(up.rstrip('/' + os.sep))
        if not parent or parent == up:
            break
        if os.path.isfile(os.path.join(parent, 'descriptor.mod')) or count_focus_files(parent):
            if not out['focusFiles'] and not out['hasDescriptor']:
                out['insideMod'] = {'name': read_descriptor_name(parent) or os.path.basename(parent), 'path': os.path.realpath(parent), 'trees': count_focus_files(parent)}
            break
        up = parent
    return out


def steam_libraries():
    libs = []
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Valve\Steam') as k:
            libs.append(winreg.QueryValueEx(k, 'SteamPath')[0])
    except Exception:
        pass
    libs += [r'C:\Program Files (x86)\Steam', r'C:\Program Files\Steam']
    for base in list(libs):
        vdf = os.path.join(base, 'steamapps', 'libraryfolders.vdf')
        try:
            with open(vdf, encoding='utf-8', errors='replace') as f:
                for m in re.finditer(r'"path"\s+"([^"]+)"', f.read()):
                    libs.append(m.group(1).replace('\\\\', '\\'))
        except OSError:
            pass
    seen, out = set(), []
    for l in libs:
        n = os.path.normcase(os.path.normpath(l))
        if n not in seen and os.path.isdir(l):
            seen.add(n)
            out.append(l)
    return out


def find_game():
    for lib in steam_libraries():
        g = os.path.join(lib, 'steamapps', 'common', 'Hearts of Iron IV')
        if os.path.isdir(os.path.join(g, 'common')):
            return os.path.realpath(g)
    return ''


GAME_DIR = None
IMG_CACHE = {}

# DXGI formats (DX10 header) that Pillow cannot read directly
DXGI_SRGB_TO_UNORM = {72: 71, 75: 74, 78: 77, 99: 98, 29: 28, 91: 87, 93: 88}
DXGI_RAW = {28: 'RGBA', 87: 'BGRA', 88: 'BGRX'}


def open_texture(path):
    """Opens a texture with Pillow, with a fallback for DDS files in sRGB and plain 32-bit DX10 formats."""
    from PIL import Image
    import io
    import struct
    try:
        im = Image.open(path)
        im.load()
        return im
    except Exception:
        if not path.lower().endswith('.dds'):
            raise
    with open(path, 'rb') as f:
        data = bytearray(f.read())
    if data[:4] != b'DDS ' or data[84:88] != b'DX10':
        raise ValueError('unsupported DDS file')
    height, width = struct.unpack_from('<II', data, 12)
    fmt = struct.unpack_from('<I', data, 128)[0]
    fmt = DXGI_SRGB_TO_UNORM.get(fmt, fmt)
    if fmt in DXGI_RAW:
        mode = DXGI_RAW[fmt]
        raw = bytes(data[148:148 + width * height * 4])
        im = Image.frombytes('RGBA', (width, height), raw, 'raw', mode)
        if mode == 'BGRX':
            im.putalpha(255)
        return im
    struct.pack_into('<I', data, 128, fmt)
    im = Image.open(io.BytesIO(bytes(data)))
    im.load()
    return im


def game_dir():
    global GAME_DIR
    if GAME_DIR is None:
        GAME_DIR = find_game()
    return GAME_DIR


def under_game(p):
    g = game_dir()
    if not g:
        return False
    rp, rg = norm(p), norm(g)
    return rp == rg or rp.startswith(rg + os.sep)


def find_mods():
    found, seen = [], set()

    def add(path, source, fallback_name=None):
        key = os.path.normcase(os.path.normpath(path))
        if key in seen or not os.path.isdir(path):
            return
        trees = count_focus_files(path)
        if not trees:
            return
        seen.add(key)
        name = read_descriptor_name(path) or fallback_name or os.path.basename(path)
        found.append({'name': name, 'path': os.path.realpath(path), 'source': source, 'trees': trees})

    for md in HOI4_MOD_DIRS:
        if not md.is_dir():
            continue
        for entry in sorted(md.iterdir()):
            if entry.is_dir():
                add(str(entry), 'local')
            elif entry.suffix.lower() == '.mod':       # launcher entries that point to a folder elsewhere
                t = mod_file_path(str(entry))
                if t:
                    add(t, 'local', entry.stem)
    for lib in steam_libraries():
        ws = os.path.join(lib, 'steamapps', 'workshop', 'content', '394360')
        if os.path.isdir(ws):
            for n in sorted(os.listdir(ws)):
                add(os.path.join(ws, n), 'workshop')
    found.sort(key=lambda m: (m['source'] != 'local', m['name'].lower()))
    g = game_dir()
    if g:
        found.append({'name': 'Hearts of Iron IV (base game, read-only)', 'path': g, 'source': 'game', 'trees': count_focus_files(g)})
    return found


def browse_dialog(initial):
    code = ("import tkinter as tk\nfrom tkinter import filedialog\n"
            "r = tk.Tk(); r.withdraw(); r.attributes('-topmost', True)\n"
            "p = filedialog.askdirectory(title='Choose your mod folder (the one with common and localisation)', initialdir=%r)\n"
            "print(p)\n" % (initial or str(HOME)))
    exe = sys.executable
    if exe.lower().endswith('pythonw.exe'):
        exe = exe[:-len('pythonw.exe')] + 'python.exe'
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    r = subprocess.run([exe, '-c', code], capture_output=True, text=True, timeout=600, creationflags=flags)
    p = (r.stdout or '').strip()
    return os.path.normpath(p) if p else ''


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = 'FocusBuilder'

    def log_message(self, *a):
        pass

    def send_bytes(self, code, body=b'', ctype='application/json', extra=None):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, obj, code=200):
        self.send_bytes(code, json.dumps(obj).encode('utf-8'))

    def fail(self, code, msg):
        self.send_json({'error': msg}, code)

    def do_GET(self):
        self.route('GET')

    def do_POST(self):
        self.route('POST')

    def route(self, method):
        host = (self.headers.get('Host') or '').lower()
        if host not in ('127.0.0.1:%d' % PORT, 'localhost:%d' % PORT):
            return self.fail(403, 'bad host')
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        try:
            if u.path.startswith('/api/'):
                return self.api(method, u.path[5:], q)
            if method != 'GET':
                return self.fail(405, 'method')
            return self.static(u.path)
        except Exception as e:  # never crash the server on one bad request
            return self.fail(500, '%s: %s' % (type(e).__name__, e))

    def static(self, path):
        rel = urllib.parse.unquote(path).lstrip('/') or 'index.html'
        parts = rel.replace('\\', '/').split('/')
        if '..' in parts or (len(parts) > 1 and parts[0] not in STATIC_DIRS) or (len(parts) == 1 and parts[0] != 'index.html'):
            return self.fail(404, 'not found')
        full = os.path.join(APP_DIR, *parts)
        ext = os.path.splitext(full)[1].lower()
        if ext not in MIME or not os.path.isfile(full):
            return self.fail(404, 'not found')
        with open(full, 'rb') as f:
            body = f.read()
        if rel == 'index.html':
            body = body.replace(b'<head>', b'<head>\n<meta name="fb-token" content="' + TOKEN.encode() + b'">', 1)
        self.send_bytes(200, body, MIME[ext])

    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_BODY:
            raise ValueError('file too large')
        return self.rfile.read(n) if n else b''

    def api(self, method, name, q):
        if name == 'hello':
            return self.send_json({'app': 'focusbuilder'})
        origin = self.headers.get('Origin')
        if origin and origin not in ('http://127.0.0.1:%d' % PORT, 'http://localhost:%d' % PORT):
            return self.fail(403, 'bad origin')
        if not secrets.compare_digest(self.headers.get('X-FB-Token') or '', TOKEN):
            return self.fail(401, 'bad token')
        if name == 'ping':
            ping['last'] = time.time(); ping['seen'] = True
            return self.send_json({'ok': True})
        if name == 'info':
            return self.send_json({'backupRoot': BACKUP_ROOT, 'home': str(HOME), 'game': game_dir()})
        if name == 'update':
            try:
                return self.send_json(check_update(q.get('force') == '1'))
            except Exception as e:
                return self.send_json({'configured': True, 'error': 'Could not check for updates: %s' % e})
        if name == 'update-install' and method == 'POST':
            if update_state['busy']:
                return self.fail(409, 'an update is already being installed')
            update_state['busy'] = True
            try:
                sha = (json.loads(self.body() or b'{}').get('sha') or '').strip()
                n = install_update(sha)
            except Exception as e:
                update_state['busy'] = False
                return self.fail(500, 'Update failed: %s' % e)
            self.send_json({'ok': True, 'files': n})
            restart_soon()
            return None
        if name == 'mods':
            return self.send_json({'mods': find_mods()})
        if name == 'diagnose' and method == 'POST':
            return self.send_json(diagnose(json.loads(self.body() or b'{}').get('path') or ''))
        if name == 'browse':
            return self.send_json({'path': browse_dialog(q.get('initial'))})
        if name == 'open':
            p = (json.loads(self.body() or b'{}').get('path') or '').strip().strip('"')
            if not p or not os.path.isdir(p):
                return self.fail(404, 'That folder does not exist: %s' % p)
            if not any(norm(p) == norm(r) for r in roots):
                roots.append(p)
            return self.send_json({'path': os.path.normpath(p), 'name': os.path.basename(os.path.normpath(p)) or p})
        path = q.get('path') or ''
        if not path or not allowed(path):
            return self.fail(403, 'That folder has not been opened in Focus Builder')
        if name == 'img':
            # Game textures are .dds, which browsers cannot show: convert to PNG (cached in memory)
            if not os.path.isfile(path):
                # like the game: a sprite that names .png/.tga may really be a .dds (and the other way round)
                stem = os.path.splitext(path)[0]
                alt = [stem + e for e in ('.dds', '.png', '.tga') if os.path.isfile(stem + e)]
                if not alt:
                    return self.fail(404, 'not a file')
                path = alt[0]
            ext = os.path.splitext(path)[1].lower()
            if ext not in ('.dds', '.png', '.tga', '.jpg', '.jpeg'):
                return self.fail(403, 'Only images can be read here')
            try:
                frames = max(1, min(64, int(q.get('frames') or 1)))
            except ValueError:
                frames = 1
            key = (norm(path), os.path.getmtime(path), frames)
            png = IMG_CACHE.get(key)
            if png is None:
                try:
                    from PIL import Image
                    import io
                    im = open_texture(path)
                    if frames > 1 and im.width >= frames:   # a strip of frames: keep the first one
                        im = im.crop((0, 0, im.width // frames, im.height))
                        box = im.convert('RGBA').getchannel('A').getbbox()   # drop the empty space around the icon
                        if box:
                            im = im.crop(box)
                    buf = io.BytesIO()
                    im.convert('RGBA').save(buf, 'PNG')
                    png = buf.getvalue()
                except ImportError:
                    return self.fail(501, 'Pillow is not installed (pip install pillow)')
                except Exception as e:
                    return self.fail(415, 'Cannot convert this image: %s' % e)
                if len(IMG_CACHE) > 3000:
                    IMG_CACHE.clear()
                IMG_CACHE[key] = png
            return self.send_bytes(200, png, 'image/png')
        if name == 'stat':
            exists = os.path.exists(path)
            return self.send_json({'exists': exists, 'kind': ('directory' if os.path.isdir(path) else 'file') if exists else None})
        if name == 'ls':
            if not os.path.isdir(path):
                return self.fail(404, 'not a folder')
            out = []
            with os.scandir(path) as it:
                for e in it:
                    try:
                        out.append({'name': e.name, 'kind': 'directory' if e.is_dir() else 'file'})
                    except OSError:
                        pass
            return self.send_json({'entries': out})
        if name == 'read':
            if not os.path.isfile(path):
                return self.fail(404, 'not a file')
            with open(path, 'rb') as f:
                return self.send_bytes(200, f.read(), 'application/octet-stream')
        if name == 'write' and method == 'POST':
            if under_game(path):
                return self.fail(403, 'The base game folder is read-only in Focus Builder')
            if os.path.splitext(path)[1].lower() not in WRITE_EXT:
                return self.fail(403, 'Only text files can be written')
            data = self.body()
            os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
            tmp = path + '.fbtmp'
            with open(tmp, 'wb') as f:
                f.write(data)
            os.replace(tmp, path)
            return self.send_json({'ok': True, 'bytes': len(data)})
        return self.fail(404, 'unknown call')


def watchdog():
    start = time.time()
    while True:
        time.sleep(5)
        if ping['seen'] and time.time() - ping['last'] > IDLE_LIMIT:
            os._exit(0)
        if not ping['seen'] and time.time() - start > 240:
            os._exit(0)


def main():
    httpd = None
    tries = 40 if os.environ.get('FB_RESTART') else 1   # after an update the old helper needs a moment to let go of the port
    for i in range(tries):
        try:
            httpd = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler)
            break
        except OSError:
            if i + 1 < tries:
                time.sleep(0.25)
    if httpd is None:
        sys.exit(0)            # already running: the launcher just opens the app
    threading.Thread(target=watchdog, daemon=True).start()
    httpd.serve_forever()


if __name__ == '__main__':
    main()
