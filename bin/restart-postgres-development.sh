#!/bin/bash


docker rm -f clug-service-postgres-development || true

docker run \
    --rm \
    -p 55432:5432 \
    --name clug-service-postgres-development \
    -e POSTGRES_PASSWORD=postgres \
    -e POSTGRES_USER=postgres \
    -e POSTGRES_DB=postgres \
    -d postgres:16
