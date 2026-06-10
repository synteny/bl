#!/bin/bash
set -e

if [ ! -f .env ]; then
  echo "Error: .env file not found. Copy .env.example to .env and fill in your details."
  exit 1
fi

source .env

if [ "$1" == "game" ]; then
  echo "Deploying game assets only..."
  GAME_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='GameBucketName'].OutputValue" --output text)
  DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='GameDistributionId'].OutputValue" --output text)

  aws s3 sync game/ s3://$GAME_BUCKET --delete
  echo "Game assets uploaded to S3."

  echo "Invalidating CloudFront cache..."
  aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"
  echo "Cache invalidation requested. Changes will propagate in 1-2 minutes."
  exit 0
fi

echo "Building SAM application..."
sam build

echo "Deploying SAM application..."
sam deploy \
  --stack-name $STACK_NAME \
  --parameter-overrides TelegramTokenParam=$TELEGRAM_TOKEN GameShortNameParam=$GAME_SHORT_NAME \
  --no-confirm-changeset \
  --capabilities CAPABILITY_IAM

echo "Fetching API Gateway endpoint..."
API_ENDPOINT=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text)

echo "Setting Telegram Webhook to: $API_ENDPOINT"
curl -s "https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${API_ENDPOINT}"

echo "Deploying game assets..."
GAME_BUCKET=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='GameBucketName'].OutputValue" --output text)
DISTRIBUTION_ID=$(aws cloudformation describe-stacks --stack-name $STACK_NAME --query "Stacks[0].Outputs[?OutputKey=='GameDistributionId'].OutputValue" --output text)

aws s3 sync game/ s3://$GAME_BUCKET --delete
aws cloudfront create-invalidation --distribution-id $DISTRIBUTION_ID --paths "/*"

echo "Full deployment complete!"