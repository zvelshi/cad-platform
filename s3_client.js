const { S3Client } = require("@aws-sdk/client-s3");
const { fromIni } = require("@aws-sdk/credential-provider-ini");
const REGION = "us-east-1";
const s3 = new S3Client({ 
    region: REGION,
    credentials: fromIni({profile: 'default'})
});
module.exports = { s3 };