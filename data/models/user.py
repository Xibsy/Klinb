import sqlalchemy as sql
import sqlalchemy.orm as orm
from typing import Optional
from sqlalchemy import Column
from werkzeug.security import generate_password_hash, check_password_hash
from ..db_session import SqlAlchemyBase, create_session


class User(SqlAlchemyBase):
    __tablename__ = 'users'

    id = sql.Column(sql.Integer, primary_key=True)
    name = sql.Column(sql.String(100), nullable=False)
    username = sql.Column(sql.String(50), unique=True, nullable=False)
    password = sql.Column(sql.String(128), nullable=False)
    avatar = sql.Column(sql.String(500), default='/static/uploads/volosatic.jpg')
    discord = sql.Column(sql.String(100))
    telegram = sql.Column(sql.String(100))

    posts = orm.relationship('Post', back_populates='user')

    @classmethod
    def create_user(cls, name: str, username: str, password: str, avatar: str = None, discord: str = None,
                    telegram: str = None) -> "User":
        session = create_session()
        user = cls(name=name, username=username, avatar=avatar or '/static/uploads/volosatic.jpg', discord=discord,
                   telegram=telegram)
        user.set_password(password)
        session.add(user)
        session.commit()
        return user

    @classmethod
    def authenticate(cls, username: str, password: str) -> Optional["User"]:
        session = create_session()
        user = session.query(cls).filter(cls.username == username).first()
        session.close()
        if user and user.check_password(password):
            return user

    def set_password(self, password: str) -> None:
        self.password = generate_password_hash(password)

    def check_password(self, password: str) -> bool:
        return check_password_hash(self.password, password)

    def to_dict(self) -> dict[str, Column[str] | Column[int]]:
        return {'id': self.id, 'name': self.name, 'username': self.username, 'avatar': self.avatar,
                'discord': self.discord, 'telegram': self.telegram}