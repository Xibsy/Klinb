import re
import sqlalchemy as sql
import datetime
import sqlalchemy.orm as orm
from ..db_session import SqlAlchemyBase


class Post(SqlAlchemyBase):
    __tablename__ = 'posts'

    id = sql.Column(sql.Integer, primary_key=True)
    user_id = sql.Column(sql.Integer, sql.ForeignKey("users.id"), nullable=False)
    content = sql.Column(sql.Text, nullable=True)
    image = sql.Column(sql.String(200), nullable=True)
    created_at = sql.Column(sql.DateTime, default=datetime.datetime.now())

    user = orm.relationship("User", back_populates="posts")
    hashtags = orm.relationship("Hashtag", secondary="post_hashtags", back_populates="posts")
    likes = orm.relationship("PostLike", backref="post", lazy="dynamic")

    def found_hashtags(self) -> list[str]:
        return re.findall(r'#(\w+)', self.content or "")

    def add_hashtags(self, session) -> None:
        from .hashtag import Hashtag
        tag_names = self.found_hashtags()
        for tag_name in tag_names:
            tag = session.query(Hashtag).filter(Hashtag.name == tag_name.lower()).first()
            if not tag:
                tag = Hashtag(name=tag_name.lower())
                session.add(tag)
            if tag not in self.hashtags:
                self.hashtags.append(tag)

    def to_dict(self, current_user_id=None) -> dict[str, list[str]]:
        found_hashtag = []
        for teg in self.hashtags:
            found_hashtag.append(teg.name)
        likes_count = self.likes.count()
        is_liked = False
        if current_user_id:
            is_liked = self.likes.filter_by(user_id=current_user_id).first()

        return {'id': self.id, 'user_id': self.user_id, 'username': self.user.username, 'content': self.content,
            'image': self.image, 'hashtags': found_hashtag, 'created_at': self.created_at.isoformat(),
            'likes': likes_count, 'liked': is_liked}