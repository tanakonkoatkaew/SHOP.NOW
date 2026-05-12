from werkzeug.security import generate_password_hash, check_password_hash
from app.extensions import init_db

class User:
    def __init__(self, **kwargs):
        self.id = kwargs.get('_id')
        self.username = kwargs.get('username')
        self.email = kwargs.get('email')
        self.password_hash = kwargs.get('password_hash')

    @staticmethod
    def get_by_username(username):
        db = init_db()
        user_data = db.users.find_one({"username": username})
        if user_data:
            return User(**user_data)
        return None

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def save(self):
        db = init_db()
        db.users.insert_one({
            "_id": self.username,
            "username": self.username,
            "email": self.email,
            "password_hash": self.password_hash
        })
