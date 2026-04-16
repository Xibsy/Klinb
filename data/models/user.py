import sqlalchemy as sql
import sqlalchemy.orm as orm
from sqlalchemy import Column
from ..db_session import SqlAlchemyBase, create_session


class User(SqlAlchemyBase):
    __tablename__ = 'users'

    id = sql.Column(sql.Integer, primary_key=True)
    name = sql.Column(sql.String(100), nullable=False)
    username = sql.Column(sql.String(50), unique=True, nullable=False)
    avatar = sql.Column(sql.String(500), default='/static/uploads/volosatic.jpg')
    discord = sql.Column(sql.String(100))
    telegram = sql.Column(sql.String(100))

    posts = orm.relationship('Post', back_populates='user')

    @classmethod
    def create_user(cls, name: str, username: str, avatar: str = None, discord: str = None,
                    telegram: str = None) -> "User":
        session = create_session()
        user = cls(name=name, username=username, avatar=avatar or '/static/uploads/volosatic.jpg', discord=discord,
                   telegram=telegram)
        session.add(user)
        session.commit()
        return user

    def to_dict(self) -> dict[str, Column[str] | Column[int]]:
        return {'id': self.id, 'name': self.name, 'username': self.username, 'avatar': self.avatar,
                'discord': self.discord, 'telegram': self.telegram}