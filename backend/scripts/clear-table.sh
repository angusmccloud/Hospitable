#!/usr/bin/env bash
# Deletes all items from HospitableData table using scan + batch-write-item
# Uses hospitable-deployer profile

set -euo pipefail

TABLE="HospitableData"
PROFILE="hospitable-deployer"
REGION="us-east-1"
DELETED=0

echo "Scanning and deleting all items from $TABLE..."

LAST_KEY=""
while true; do
  if [ -z "$LAST_KEY" ]; then
    RESULT=$(aws dynamodb scan \
      --table-name "$TABLE" \
      --projection-expression "pk, sk" \
      --max-items 25 \
      --profile "$PROFILE" \
      --region "$REGION" \
      --output json 2>&1)
  else
    RESULT=$(aws dynamodb scan \
      --table-name "$TABLE" \
      --projection-expression "pk, sk" \
      --max-items 25 \
      --starting-token "$LAST_KEY" \
      --profile "$PROFILE" \
      --region "$REGION" \
      --output json 2>&1)
  fi

  # Extract items
  ITEMS=$(echo "$RESULT" | python3 -c "
import sys, json
data = json.load(sys.stdin)
items = data.get('Items', [])
if not items:
    sys.exit(0)
# Build batch-write-item delete requests (max 25 per batch)
requests = []
for item in items:
    pk = item['pk']['S'] if 'S' in item.get('pk', {}) else item.get('pk', '')
    sk = item['sk']['S'] if 'S' in item.get('sk', {}) else item.get('sk', '')
    requests.append({
        'DeleteRequest': {
            'Key': {
                'pk': {'S': pk},
                'sk': {'S': sk}
            }
        }
    })
print(json.dumps({'$TABLE': requests}))
" 2>/dev/null) || true

  COUNT=$(echo "$RESULT" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('Items',[])))")

  if [ "$COUNT" -eq 0 ]; then
    break
  fi

  if [ -n "$ITEMS" ] && [ "$ITEMS" != "null" ]; then
    echo "$ITEMS" | sed "s/\\\$TABLE/$TABLE/g" > /tmp/ddb-delete-batch.json
    aws dynamodb batch-write-item \
      --request-items file:///tmp/ddb-delete-batch.json \
      --profile "$PROFILE" \
      --region "$REGION" > /dev/null
    DELETED=$((DELETED + COUNT))
    echo "  Deleted $DELETED items so far..."
  fi

  # Check for next page
  LAST_KEY=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('NextToken',''))" 2>/dev/null) || true
  if [ -z "$LAST_KEY" ]; then
    break
  fi
done

echo "Done. Deleted $DELETED total items."
