#!/usr/bin/env python3
"""Repository entrypoint; canonical packager ships inside the skill."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).resolve().parents[1]/'skills/wechat-workflow/scripts/build_image_post.py'), run_name='__main__')
