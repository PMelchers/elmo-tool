"""Publishes the current version of Elmo tool to the public GitHub repository.

This folder (Focus Builder) is where Elmo tool is developed, with its full history. The public repository
(by default Documents/GitHub/elmo-tool, made in GitHub Desktop) only gets clean copies of the committed files:

    python tools/publish.py "Short description of what changed"

The script copies every committed file into the public repository and makes one commit there.
Then press "Push origin" in GitHub Desktop: everyone's Elmo tool sees the update and offers to install it,
with the description as the change notes.
"""
import io
import os
import shutil
import subprocess
import sys
import tarfile

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TARGET = os.environ.get('ELMO_PUBLISH_DIR') or os.path.join(os.path.expanduser('~'), 'Documents', 'GitHub', 'elmo-tool')
KEEP = {'.git', '.gitattributes'}          # files of the public repository itself
SKIP = ('marketplace-repo/',)               # lives in its own repository (elmo-guides)


def git(cwd, *args, capture=True):
    r = subprocess.run(['git', *args], cwd=cwd, capture_output=capture)
    if r.returncode != 0:
        raise SystemExit('git %s failed:\n%s' % (' '.join(args), (r.stderr or b'').decode(errors='replace')))
    return r.stdout


def main():
    message = ' '.join(sys.argv[1:]).strip() or 'Update Elmo tool'
    if not os.path.isdir(os.path.join(TARGET, '.git')):
        raise SystemExit('No git repository at %s. Create "elmo-tool" in GitHub Desktop first.' % TARGET)
    if git(HERE, 'status', '--porcelain').strip():
        print('Note: uncommitted changes in this folder are NOT published. Commit them first if they should be.')
    # empty the public copy (except its own git data) and put the committed files in
    for name in os.listdir(TARGET):
        if name in KEEP:
            continue
        p = os.path.join(TARGET, name)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    archive = git(HERE, 'archive', '--format=tar', 'HEAD')
    with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
        members = [m for m in tar.getmembers() if not (m.name + '/').startswith(SKIP) and '..' not in m.name.split('/')]
        tar.extractall(TARGET, members=members, **({'filter': 'data'} if hasattr(tarfile, 'data_filter') else {}))
    git(TARGET, 'add', '-A')
    if not git(TARGET, 'status', '--porcelain').strip():
        print('Nothing changed since the last publish.')
        return
    git(TARGET, 'commit', '-q', '-m', message)
    print('Published to %s:' % TARGET)
    print(git(TARGET, 'log', '-1', '--format=%h %s').decode().strip())
    print('Now press "Push origin" in GitHub Desktop (repository elmo-tool).')


if __name__ == '__main__':
    main()
