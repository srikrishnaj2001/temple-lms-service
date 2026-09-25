'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    // Static method to normalize email
    static normalizeEmail(email) {
      return email.toLowerCase().trim();
    }
  }

  User.init({
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      set(value) {
        // Always store email in lowercase
        this.setDataValue('email', User.normalizeEmail(value));
      }
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true
    },
    imageUrl: {
      type: DataTypes.STRING(2048),
      allowNull: true
    },
    onboardingSkipped: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  }, {
    sequelize,
    modelName: 'User',
    tableName: 'users',
    paranoid: true, // Enables soft deletes
    hooks: {
      beforeValidate: (user) => {
        if (user.email) {
          user.email = User.normalizeEmail(user.email);
        }
      }
    },
    indexes: [
      {
        name: 'idx_users_email',
        fields: ['email'],
        unique: true
      }
    ]
  });

  return User;
};
