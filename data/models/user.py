from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(50), unique=True, nullable=False)
    avatar = db.Column(db.String(200), default='https://i.pravatar.cc/150?img=3')
    discord = db.Column(db.String(100))
    telegram = db.Column(db.String(100))
