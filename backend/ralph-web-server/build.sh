#!/bin/bash

WATCH_MODE=false
if [[ "$1" == "--watch" ]]; then
  WATCH_MODE=true
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE}")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/../.." && pwd)
FRONTEND_DIST="$REPO_ROOT/frontend/ralph-web/dist"

if [ "$WATCH_MODE" = true ]; then
  # Watch mode: run the bundle.js with Bun
  echo "Running backend from bundle (dev mode)..."

  # Ensure backend bundle exists
  if [ ! -f "$SCRIPT_DIR/dist/bundle.js" ]; then
    echo "Backend bundle not found, building..."
    cd "$SCRIPT_DIR"
    bun build src/serve.ts --outfile dist/bundle.js --target bun
    if [ $? -ne 0 ]; then
      echo "Backend build failed!"
      exit 1
    fi
  fi

  # Check if frontend needs to be built
  if [ ! -d "$FRONTEND_DIST" ]; then
    echo "Frontend dist not found, building..."
    cd "$REPO_ROOT/frontend/ralph-web" && npm run build
  fi

  # Change to script directory and run bundle.js
  cd "$SCRIPT_DIR"
  exec bun dist/bundle.js
else
  # Single build mode: create bundle and embed frontend
  echo "Building backend bundle..."
  bun build src/serve.ts --outfile dist/bundle.js --target bun

  if [ $? -ne 0 ]; then
    echo "Build failed!"
    exit 1
  fi

  echo "Backend bundle built successfully!"

  if [ -d "$FRONTEND_DIST" ]; then
    echo "Copying frontend dist to backend dist..."
    rm -rf dist/frontend
    cp -r "$FRONTEND_DIST" dist/frontend
    echo "Frontend copied successfully!"
  else
    echo "Warning: Frontend dist not found at $FRONTEND_DIST"
    echo "Run: cd $FRONTEND_DIST/.. && npm run build"
  fi
fi
