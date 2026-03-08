import os
import sys
import subprocess

worktree_backend = os.path.dirname(os.path.abspath(__file__))
os.chdir(worktree_backend)
sys.path.insert(0, worktree_backend)

# Use main repo venv python; fall back to current interpreter
main_venv_python = '/Users/arafrahman/Desktop/Real-Food/backend/venv/bin/python3'
python = main_venv_python if os.path.exists(main_venv_python) else sys.executable

os.environ['PYTHONPATH'] = worktree_backend

subprocess.run([
    python, '-m', 'uvicorn', 'app.main:app',
    '--reload', '--host', '0.0.0.0', '--port', '8000'
], cwd=worktree_backend)
