from flask import Blueprint, render_template, session
import data.db_session as db
from data.models.post import Post
from data.models.hashtag import Hashtag
from secret import ADMINS
from data.models.user import User


pages = Blueprint('pages', __name__)


@pages.route("/")
def index() -> str:
    return render_template('index.html')


@pages.route('/lenta')
def lenta() -> str:
    db_sess = db.create_session()
    posts = db_sess.query(Post).order_by(Post.id.desc()).all()
    current_user_id = session.get('user_id')
    is_admin = False
    if current_user_id:
        user = db_sess.get(User, current_user_id)
        if user.username in ADMINS:
            is_admin = True
    return render_template('lenta.html', posts=posts, current_user_id=current_user_id,
                           is_admin=is_admin)

@pages.route('/hashtag/<tag_name>')
def hashtag_posts(tag_name: str) -> str:
    db_sess = db.create_session()
    hashtag = db_sess.query(Hashtag).filter(Hashtag.name == tag_name.lower()).first()
    posts = hashtag.posts if hashtag else []
    current_user_id = session.get('user_id')
    is_admin = False
    if current_user_id:
        user = db_sess.get(User, current_user_id)
        if user.username in ADMINS:
            is_admin = True
    return render_template('lenta.html', posts=posts, hashtag=tag_name,
                           current_user_id=current_user_id, is_admin=is_admin)