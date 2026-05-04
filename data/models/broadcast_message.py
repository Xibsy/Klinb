import sqlalchemy as sql
from sqlalchemy import Column
from ..db_session import SqlAlchemyBase, create_session


class Message(SqlAlchemyBase):
    __tablename__ = 'broadcasts'

    id = sql.Column(sql.Integer, primary_key=True)
    content = sql.Column(sql.Text, nullable=True)

    @classmethod
    def create(cls, content: str) -> "Message":
        session = create_session()
        message = cls(content=content)
        session.add(message)
        session.commit()
        session.close()
        return message

    def to_dict(self) -> dict[str, Column[int] | Column[str]]:
        return {'id': self.id, 'content': self.content}