"""Deployment entry point; factories remain free of data-directory side effects."""
from .main import create_app

app = create_app()
