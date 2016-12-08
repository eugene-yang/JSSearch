# JSSearch

Author: Eugene Yang

This is a course project of Information Retrieval in Georgetown University. 

## Environment

- This project is run under nodeJS v7.0.0.

Fast and clean way to install nodeJS on Linux:

```shell
apt-get install nvm
nvm install node
```

- Please install dependencies by npm using the following command under the project directory

```shell
npm install
```

- In order to run container in a safe and clean way, please expose garbage collection function by adding argument `--expose-gc` when execute `node`.

## Configuration

- Configurations are listed in `config.json`, including memory constraint and flush bunch settings. 

- Please assign **-1** to `memory_limit` if do not want any memory constraint.

- Default similarity parameter settings are listed in `config.json`.

## Scripts

For building index:

```shell
node build [trec-files-directory-path] [index-type] [output-dir]
```

Or for using default settings, you can execute `build.bat` on Windows or `build.sh` on Unix-like systems.

For executing query file:
```shell
node query_search [index-directory-path] [query-file-path] [retrieval-model] [index-type] [search-type] [optional: results-file]
```

Or use default directories:
```
node query_search -a [retrieval-model] [index-type] [search-type] [optional: results-file]
```

## License

Apache License 2.0

