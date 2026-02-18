#!/usr/bin/env python3
"""Delete all items from the HospitableData DynamoDB table."""
import boto3

session = boto3.Session(profile_name="hospitable-deployer", region_name="us-east-1")
ddb = session.resource("dynamodb")
table = ddb.Table("HospitableData")

deleted = 0
scan_kwargs = {"ProjectionExpression": "pk, sk"}

while True:
    resp = table.scan(**scan_kwargs)
    items = resp.get("Items", [])
    if not items:
        break

    with table.batch_writer() as batch:
        for item in items:
            batch.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
            deleted += 1

    print(f"  Deleted {deleted} items so far...")

    if "LastEvaluatedKey" not in resp:
        break
    scan_kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]

print(f"Done. Deleted {deleted} total items.")
