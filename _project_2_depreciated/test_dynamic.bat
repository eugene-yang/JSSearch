@echo BM25
node query_dynamic ./_indexes/ ./_data/QueryFile/queryfile.txt ./_results/bm25_dynamic.txt bm25
_data\bin\trec_eval_Windows ./_data/QueryFile/qrels.txt  ./_results/bm25_dynamic.txt

@echo Cosine
node query_dynamic ./_indexes/ ./_data/QueryFile/queryfile.txt ./_results/cosine_dynamic.txt cosine
_data\bin\trec_eval_Windows ./_data/QueryFile/qrels.txt  ./_results/cosine_dynamic.txt

@echo LM
node query_dynamic ./_indexes/ ./_data/QueryFile/queryfile.txt ./_results/lm_dynamic.txt lm
_data\bin\trec_eval_Windows ./_data/QueryFile/qrels.txt  ./_results/lm_dynamic.txt