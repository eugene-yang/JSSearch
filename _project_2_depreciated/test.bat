@echo BM25
node query_static ./_indexes/ ./_data/QueryFile/queryfile.txt bm25 single ./_results/bm25_single.txt
_data\bin\trec_eval_Windows ./_data/QueryFile/qrels.txt  ./_results/bm25_single.txt

@echo Cosine
node query_static ./_indexes/ ./_data/QueryFile/queryfile.txt cosine single ./_results/cosine_single.txt
_data\bin\trec_eval_Windows ./_data/QueryFile/qrels.txt  ./_results/cosine_single.txt

@echo LM
node query_static ./_indexes/ ./_data/QueryFile/queryfile.txt lm single ./_results/lm_single.txt
_data\bin\trec_eval_Windows ./_data/QueryFile/qrels.txt  ./_results/lm_single.txt