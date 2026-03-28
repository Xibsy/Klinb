from .user import db
import re


class Post(db.Model):
    __tablename__ = 'posts'
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False)
    content = db.Column(db.Text, nullable=True)
    image = db.Column(db.String(200), nullable=True)

    user = db.relationship('User', backref='posts')
    hashtags = db.relationship('Hashtag', secondary='post_hashtags', backref='posts')

    def found_hashtags(self) -> list[str]:
        return re.findall(r'#(\w+)', self.content)

    def add_hashtags(self) -> None:
        from .hashtag import Hashtag
        tag_names = self.found_hashtags()
        for tag_name in tag_names:
            tag = Hashtag.query.filter_by(name=tag_name.lower()).first()
            if not tag:
                tag = Hashtag(name=tag_name.lower())
                db.session.add(tag)
            if tag not in self.hashtags:
                self.hashtags.append(tag)
        db.session.commit()

    def to_dict(self) -> dict:
        return {'id': self.id, 'user_id': self.user_id, 'username': self.user.username if self.user else None,
            'content': self.content, 'image': self.image, 'hashtags': [h.name for h in self.hashtags]}