#!/bin/bash

CURRENT_DIR=$(dirname $0)
echo "CURRENT_DIR: " + $CURRENT_DIR

docker build \
    --progress plain \
    -t clug-service \
    $CURRENT_DIR/..

