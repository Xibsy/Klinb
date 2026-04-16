import sqlalchemy as sql
import sqlalchemy.orm as orm
from ..db_session import SqlAlchemyBase


class Hashtag(SqlAlchemyBase):
    __tablename__ = 'hashtags'
    id = sql.Column(sql.Integer, primary_key=True)
    name = sql.Column(sql.String(50), unique=True, nullable=False)
    posts = orm.relationship('Post', secondary='post_hashtags', back_populates='hashtags')


class PostHashtag(SqlAlchemyBase):
    __tablename__ = 'post_hashtags'
    post_id = sql.Column(sql.Integer, sql.ForeignKey('posts.id'), primary_key=True)
    hashtag_id = sql.Column(sql.Integer, sql.ForeignKey('hashtags.id'), primary_key=True)