import sqlalchemy as sql
from ..db_session import SqlAlchemyBase


class PostLike(SqlAlchemyBase):
    __tablename__ = 'post_likes'

    user_id = sql.Column(sql.Integer, sql.ForeignKey('users.id'), primary_key=True)
    post_id = sql.Column(sql.Integer, sql.ForeignKey('posts.id'), primary_key=True)