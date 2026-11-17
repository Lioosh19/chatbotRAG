const path = require("path");
const RAGEngine = require("../lib/rag");

const ragEngine = new RAGEngine();

module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");
  ragEngine.loadData();
  res.status(200).json({
    total: ragEngine.products.length,
    products: ragEngine.products
  });
};
