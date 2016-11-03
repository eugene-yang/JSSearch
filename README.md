# JSSearch

Author: Eugene Yang

This is a course project of Information Retrieval in Georgetown University. 

## Environment

- This project is run under nodeJS v6.7.0.

- Please install dependencies by npm using the following command under the project directory

```shell
npm install
```

- In order to run container in a safe and clean way, please expose garbage collection function by adding argument `--expose-gc` when execute `node`.

## Configuration

- Configurations are listed in `config.json`, including memory constraint and flush bunch settings. 

- Please assign **-1** to `memory_limit` if do not want any memory constraint.

- Default similarity parameter settings are listed in `config.json`.

## Scripts Required

- All arguments required are implemented

- Please use the following commands to execute the require scripts

```shell
node build [trec-files-directory-path] [index-type] [output-dir]
node query_static [index-directory-path] [query-file-path] [retrieval-model] [index-type] [results-file]
node query_dynamic [index-directory-path] [query-file-path] [results-file] 
```

## License

Apache License 2.0

