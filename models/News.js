const mongoose = require('mongoose');
const newsSchema = new mongoose.Schema({
  title: String,
  content: String,
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now }
});
module.exports = mongoose.model('News', newsSchema);
