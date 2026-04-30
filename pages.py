from flask import Blueprint, render_template
import data.db_session as db
from data.models.post import Post
from data.models.hashtag import Hashtag


pages = Blueprint('pages', __name__)


@pages.route("/")
def index() -> str:
    return render_template('index.html')


@pages.route('/lenta')
def lenta() -> str:
    db_sess = db.create_session()
    posts = db_sess.query(Post).order_by(Post.id.desc()).all()
    return render_template('lenta.html', posts=posts)


@pages.route('/hashtag/<tag_name>')
def hashtag_posts(tag_name: str) -> str:
    db_sess = db.create_session()
    hashtag = db_sess.query(Hashtag).filter(Hashtag.name == tag_name.lower()).first()
    posts = hashtag.posts if hashtag else []
    return render_template('lenta.html', posts=posts, hashtag=tag_name)