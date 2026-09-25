# To run migrations:

```
DATABASE_URL="postgres://postgres:postgres@localhost:55432/postgres" npx sequelize-cli db:migrate --env env
```

#### Create a migration

```
npx sequelize-cli migration:create --name ...some-name-of-migration-you-want...
```
