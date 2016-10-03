# JSSearch

Author: Eugene Yang

This is a course project of Information Retrieval in Georgetown University. 

## Environment

- This project is run under nodeJS v6.2.2.

- Please install dependencies by npm using the following command under the project directory

```shell
npm install
```

- In order to run container in a safe and clean way, please expose garbage collection function by adding argument `--expose-gc` when execute `node`.

## Configuration

- Configurations are listed in `config.json`, including memory constraint and flush bunch settings. 

- Please assign **-1** to `memory_limit` if do not want any memory constraint.

- The `inverted_index_type` configuration is only for the output filename, configurations for different tokenizer, phrase parser or stemmer.

- Benchmark dataset should put in `_data` folder right under the root directory of this project. This directory configuration can be found in `buildBenchInvertedIndex.js`, which is the container for building inverted index for this specific dataset.

## Running The Container

- After specified the container, user can use `require("PathToYourContainer.js")` to import the container.

- Use the method `run()` of the container to execute the pre-defined script.

- Container supports event handler by using `.on('eventName', handler)` and `.off('eventName', handler)`, the following are the events could be listened by the container.

	- flush
	- push
	- read
	- documentAdded
	- mergingStarted
	- mergingDone
	- itemAdded
	- finalizingStarted
	- finalizingDone
	- buildInvertedIndexStarted
	- buildInvertedIndexDone
	- buildHashTableStarted
	- buildHashTableDone
	- invokeCallFunction

	The event handler would have 2 arguments, `event` and `data`. The `event` object would include a property `target` indicates the target of the event.

- Sample of the usage can be found in `buildBenchInvertedIndex.js` and `runStats.js`

- To run `runStats.js`, which is the script for generating the statistical report, please use the following command.

```shell
node --expose-gc runStats.js
``` 

## License

![CC BY-NC-SA](https://licensebuttons.net/l/by-nc-sa/3.0/88x31.png)

Further information please refer to [this link](https://creativecommons.org/licenses/by-nc-sa/4.0/).

