"""In-app user notifications.

Stored in the `notifications` collection, one document per event, keyed by the
recipient's user id (always stored as a string so lookups are consistent
whether the caller passes an ObjectId or a str).
"""
import uuid
from datetime import datetime, timezone


def push_notification(db, user_id, title, body="", ntype="info"):
    """Insert a notification for a user. Best-effort; never raises."""
    try:
        db.notifications.insert_one({
            "_id":        str(uuid.uuid4()),
            "user_id":    str(user_id),
            "title":      title,
            "body":       body,
            "type":       ntype,          # info | success | warning | error
            "read":       False,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception as e:
        print("[notify] failed to push notification:", e)
