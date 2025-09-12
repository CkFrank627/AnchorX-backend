// models/Role.js

const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    notes: {
        type: String,
        default: ''
    },
    color: {
        type: String,
        default: '#000000'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = roleSchema;