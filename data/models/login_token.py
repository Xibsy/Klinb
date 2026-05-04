import sqlalchemy as sql
from sqlalchemy import Column
from secrets import token_hex
from ..db_session import SqlAlchemyBase, create_session


class LoginToken(SqlAlchemyBase):
    __tablename__ = 'login_tokens'

    id = sql.Column(sql.Integer, primary_key=True)
    username = sql.Column(sql.Text, nullable=False)
    token = sql.Column(sql.Text, nullable=False)
    ip = sql.Column(sql.Text, nullable=False)


    @classmethod
    def create_new_token(cls, username: str, ip: str) -> "LoginToken":
        session = create_session()
        token = token_hex(24)
        user = cls(username=username, token=token, ip=ip)
        session.add(user)
        session.commit()
        session.close()
        return user

    def to_dict(self) -> dict[str, Column[int] | Column[str]]:
        return {'id': self.id, 'token': self.token, 'username': self.username}