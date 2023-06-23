/*
* File Name: db_client.js
* Author: Zac Velshi
* Date Created: 2023-06-20
* Last Modified: 2023-06-20
* Purpose: This file contains the code to interface with the AWS DynamoDB API.
*/

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");

const REGION = "us-east-1";
const db = new DynamoDBClient({ 
    region: REGION,
    credentials: fromIni({profile: 'default'})
});

const marshallOptions = {
    // Whether to automatically convert empty strings, blobs, and sets to `null`.
    convertEmptyValues: false, // false, by default.
    // Whether to remove undefined values while marshalling.
    removeUndefinedValues: false, // false, by default.
    // Whether to convert typeof object to map attribute.
    convertClassInstanceToMap: false, // false, by default.
};

const unmarshallOptions = {
    // Whether to return numbers as a string instead of converting them to native JavaScript numbers.
    wrapNumbers: false, // false, by default.
};
  
const translateConfig = { marshallOptions, unmarshallOptions };
const dbdoc = DynamoDBDocumentClient.from(db, translateConfig);

module.exports = { dbdoc };