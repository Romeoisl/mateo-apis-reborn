const mongoose = require('mongoose');
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  email: String,
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  profile: {
    name: String,
    bio: String,
    avatar: String,
  }
});
module.exports = mongoose.model('User', userSchema);
