import re
import sqlalchemy as sql
import sqlalchemy.orm as orm
from ..db_session import SqlAlchemyBase


class Post(SqlAlchemyBase):
    __tablename__ = 'posts'

    id = sql.Column(sql.Integer, primary_key=True)
    user_id = sql.Column(sql.Integer, sql.ForeignKey("users.id"), nullable=False)
    content = sql.Column(sql.Text, nullable=True)
    image = sql.Column(sql.String(200), nullable=True)

    user = orm.relationship("User", back_populates="posts")
    hashtags = orm.relationship("Hashtag", secondary="post_hashtags", back_populates="posts")

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

    def to_dict(self) -> dict[str, list[str]]:
        found_hashtag: list[str] = []
        for teg in self.hashtags:
            found_hashtag.append(teg.name)
        return {'id': self.id, 'user_id': self.user_id, 'username': self.user.username, 'content': self.content,
                'image': self.image, 'hashtags': found_hashtag}
