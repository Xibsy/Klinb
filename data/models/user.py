from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = 'users'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    username = db.Column(db.String(50), unique=True, nullable=False)
    avatar = db.Column(db.String(500), default='/static/uploads/volosatic.jpg')
    discord = db.Column(db.String(100))
    telegram = db.Column(db.String(100))

    @classmethod
    def create_user(cls, name: str, username: str, avatar: str = None, discord: str = None,
                    telegram: str = None) -> "User":
        user = cls(name=name, username=username, avatar=avatar or '/static/uploads/volosatic.jpg', discord=discord,
                   telegram=telegram)
        db.session.add(user)
        db.session.commit()
        return user

    def to_dict(self) -> dict[str, list[str]]:
        return {'id': self.id, 'name': self.name, 'username': self.username, 'avatar': self.avatar,
                'discord': self.discord, 'telegram': self.telegram}
