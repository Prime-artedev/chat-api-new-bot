# WhatsAPI

> An awesome WhatsApp API based on TypeScript
        
## Project structure
<pre>
.
|-- Dockerfile
|-- README.md
|-- docker-compose.yml
|-- instances
|   `-- MyNewInstance.json
|-- jest.config.js
|-- package-lock.json
|-- package.json
|-- src
|   |-- Server.integration.spec.ts
|   |-- Server.ts
|   |-- config
|   |   |-- env
|   |   |   `-- index.ts
|   |   |-- index.ts
|   |   `-- logger
|   |       `-- index.ts
|   |-- controllers
|   |   `-- InstanceController.ts
|   |-- index.ts
|   |-- models
|   |   `-- SendMessge.ts
|   `-- services
|       |-- Instance.ts
|       `-- instances
|           `-- MyNewInstance.json
|-- tsconfig.compile.json
|-- tsconfig.json
`-- views
    `-- swagger.ejs

10 directories, 20 files

</pre>

## Updating to newer versions

```shell
git add .
git commit -m "initial commit"
git push origin master
```

<hr>

# Server Commands

## Installing latest version of node js
```shell
curl -sL https://deb.nodesource.com/setup_16.x -o /tmp/nodesource_setup.sh
sudo bash /tmp/nodesource_setup.sh
sudo apt-get install -y nodejs
node --version
```

## Installing required packages
```shell
sudo npm install -g pm2
```
# Database Prisma
If the database is not created, and the user has permissions, execute the command below:
```shell
npm run prisma:migrate
```
## Generate the Prisma Client with the following command
```shell
npm run prisma:generate
```
Database communication tool - optional - see build.sh file

## Change the bank connection string in the .env file
```
DATABASE_URL                = mysql://<user>:<hardPassword>@<url/ip connection>/<database>
```

## Builing the project
```shell
cd api
npm run build
```

## Starting the project
```shell
sudo pm2 start npm --name WhatsAPINodeJs -- run "start:prod"
sudo pm2 status WhatsAPINodeJs
sudo pm2 restart WhatsAPINodeJs
```

## Deploying new versions
```shell
git pull origin master
npm install 
npm run build
pm2 "npm run start:prod" --name WhatsApi
```
