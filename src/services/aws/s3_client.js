/*
* File Name: s3_client.js
* Date Created: 2023-06-13
* Last Modified: 2023-06-20
* Purpose: This file contains the code to interface with the AWS S3 API.
*/

const { S3Client } = require("@aws-sdk/client-s3");
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const REGION = "us-east-1";
const s3 = new S3Client({ 
    region: REGION,
    credentials: fromIni({profile: 'default'})
});
module.exports = { s3 };