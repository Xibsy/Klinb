import os
from flask import Flask, render_template, request, jsonify, redirect, url_for, session, Response
from werkzeug.utils import secure_filename
from data.models.user import db, User
from data.models.post import Post
from data.models.hashtag import Hashtag
from data.utilities.compress_photo import compress_photo

klinb_app = Flask(__name__, static_folder='static')
klinb_app.secret_key = "очень большой секрет"

klinb_app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///blink.db'
klinb_app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
klinb_app.config['UPLOAD_FOLDER'] = os.path.join('static', 'uploads')
klinb_app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024

os.makedirs(klinb_app.config['UPLOAD_FOLDER'], exist_ok=True)

db.init_app(klinb_app)

with klinb_app.app_context():
    db.create_all()

@klinb_app.route('/api/register', methods=['POST'])
def register() -> tuple[Response, int]:
    data = request.get_json()
    name = data.get('name')
    username = data.get('username')
    avatar = data.get('avatar')
    discord = data.get('discord')
    telegram = data.get('telegram')

    if not name or not username:
        return jsonify({"status": "error", "message": "заполни правильно"}), 400

    existing_user = User.query.filter_by(username=username).first()
    if existing_user:
        return jsonify({"status": "error", "message": "Пользователь с таким username уже существует"}), 400
    user = User.create_user(name=name, username=username, avatar=avatar, discord=discord, telegram=telegram)
    session['user_id'] = user.id
    session['username'] = user.username
    return jsonify({"status": "success", "message": "Регистрация успешна", "user": user.to_dict()}), 200


@klinb_app.route('/api/login', methods=['POST'])
def login() -> tuple[Response, int]:
    data = request.get_json()
    username = data.get('username')
    if not username:
        return jsonify({"status": "error", "message": "ты забыл username"}), 400
    user = User.query.filter_by(username=username).first()
    if not user:
        return jsonify({"status": "error", "message": "таких не знаем"}), 404
    session['user_id'] = user.id
    session['username'] = user.username
    return jsonify({"status": "success", "user": user.to_dict()}), 200


@klinb_app.route('/api/logout', methods=['POST'])
def logout() -> tuple[Response, int]:
    session.clear()
    return jsonify({"status": "success", "message": "Выход выполнен"}), 200


@klinb_app.route('/api/current_user', methods=['GET'])
def current_user() -> tuple[Response, int]:
    if 'user_id' in session:
        user = User.query.get(session['user_id'])
        if user:
            return jsonify({"status": "success", "user": user.to_dict()}), 200
    return jsonify({"status": "error", "message": "еще не зашел :("}), 401


@klinb_app.route('/new_post', methods=['GET', 'POST'])
def new_post() -> Response | str:
    if request.method == 'POST':
        user_id = request.form.get('user_id')
        content = request.form.get('content')
        image_file = request.files.get('image')
        filename = None

        if image_file and image_file.filename != '':
            filename = secure_filename(image_file.filename)
            name, ext = os.path.splitext(filename)
            filename = f"{name}_{os.urandom(4).hex()}{ext}"
            filepath = os.path.join(klinb_app.config['UPLOAD_FOLDER'], filename)
            image_file.save(filepath)
            compress_photo(filepath)

        new_post = Post(user_id=user_id, content=content, image=filename)
        db.session.add(new_post)
        db.session.commit()
        new_post.add_hashtags()

        return redirect(url_for('lenta'))

    users = User.query.all()
    return render_template('new_post.html', users=users)


@klinb_app.route('/lenta')
def lenta() -> str:
    posts = Post.query.order_by(Post.id.desc()).all()
    return render_template('lenta.html', posts=posts)


@klinb_app.route('/hashtag/<tag_name>')
def hashtag_posts(tag_name: str) -> str:
    hashtag = Hashtag.query.filter_by(name=tag_name.lower()).first()
    posts = hashtag.posts if hashtag else []
    return render_template('lenta.html', posts=posts, hashtag=tag_name)


@klinb_app.route('/api/posts', methods=['GET'])
def get_posts() -> tuple[Response, int]:
    tag = request.args.get('hashtag')
    if tag:
        hashtag = Hashtag.query.filter_by(name=tag.lower()).first()
        posts = hashtag.posts if hashtag else []
    else:
        posts = Post.query.order_by(Post.id.desc()).all()
    return jsonify({"status": "success", "posts": [post.to_dict() for post in posts]}), 200


@klinb_app.route('/api/posts', methods=['POST'])
def create_post_api() -> tuple[Response, int]:
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Сначала авторизуйтесь"}), 401

    data = request.get_json()
    content = data.get('content')
    if not content:
        return jsonify({"status": "error", "message": "выложи что то, а не пустоту"}), 400

    new_post = Post(user_id=session['user_id'], content=content)
    db.session.add(new_post)
    db.session.commit()
    new_post.add_hashtags()

    return jsonify({"status": "success", "post": new_post.to_dict()}), 201


@klinb_app.route("/")
def index() -> str:
    return render_template('index.html')


@klinb_app.route('/add_friend', methods=['POST'])
def add_friend() -> tuple[Response, int]:
    data = request.get_json()
    friend_name = data.get('name')
    if friend_name:
        return jsonify({"status": "success", "message": f"У вас теперь в друзьях - {friend_name}"}), 200
    else:
        return jsonify({"status": "error", "message": "напиши сначала кого добавить"}), 400


if __name__ == '__main__':
    klinb_app.run(host='', port=8080, debug=True)