module.exports = {
  "extends": "airbnb-base",
  "env": {
    "jest": true
  },
  "rules": {
    "prefer-destructuring": [
      "error", {
        "VariableDeclarator": {
          "array": false,
          "object": false
        },
        "AssignmentExpression": {
          "array": false,
          "object": false
        }
      },
      {
        "enforceForRenamedProperties": false
      }
    ],
    "max-len": [
      "error",
      {
        "code": 140,
        "ignoreComments": true,
        "ignoreTrailingComments": true,
        "ignoreStrings": true,
        "ignoreTemplateLiterals": true,
        "ignoreRegExpLiterals": true
      }
    ]
  }
};
