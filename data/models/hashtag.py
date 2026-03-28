from .user import db


class Hashtag(db.Model):
    __tablename__ = 'hashtags'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), unique=True, nullable=False)


class PostHashtag(db.Model):
    __tablename__ = 'post_hashtags'
    post_id = db.Column(db.Integer, db.ForeignKey('posts.id'), primary_key=True)
    hashtag_id = db.Column(db.Integer, db.ForeignKey('hashtags.id'), primary_key=True)