import os
from pathlib import Path
from flask import Blueprint, render_template, request, jsonify, redirect, url_for, session, Response
from werkzeug.utils import secure_filename
import data.db_session as db
from data.models.user import User
from data.models.post import Post
from data.models.hashtag import Hashtag
from data.utilities.compress_photo import compress_photo

all_api = Blueprint('main', __name__)


@all_api.route('/api/register', methods=['POST'])
def register() -> tuple[Response, int]:
    data = request.get_json()
    name = data.get('name')
    username = data.get('username')
    password = data.get('password')
    avatar = data.get('avatar')
    discord = data.get('discord')
    telegram = data.get('telegram')

    if not name or not username or not password:
        return jsonify({"status": "error", "message": "заполните бланк"}), 400
    if len(password) < 4:
        return jsonify({"status": "error", "message": "минимум 4 символа"}), 400
    user = User.create_user(name=name, username=username, password=password, avatar=avatar, discord=discord, telegram=telegram)
    if not user:
        return jsonify({"status": "error", "message": "Пользователь с таким username уже существует"}), 400

    session['user_id'] = user.id
    session['username'] = user.username
    return jsonify(
        {"status": "success", "message": f"Добро пожаловать на сайт klink, {name}", "user": user.to_dict()}), 200


@all_api.route('/api/login', methods=['POST'])
def login() -> tuple[Response, int]:
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({"status": "error", "message": "введите username и пароль"}), 400
    user = User.authenticate(username, password)
    if not user:
        return jsonify({"status": "error", "message": "неверный username или пароль"}), 401
    session['user_id'] = user.id
    session['username'] = user.username
    return jsonify({"status": "success", "user": user.to_dict()}), 200


@all_api.route('/api/logout', methods=['POST'])
def logout() -> tuple[Response, int]:
    session.clear()
    return jsonify({"status": "success", "message": "Вы вышли"}), 200


@all_api.route('/api/current_user', methods=['GET'])
def current_user() -> tuple[Response, int]:
    if 'user_id' in session:
        db_sess = db.create_session()
        user = db_sess.get(User, session['user_id'])
        if user:
            return jsonify({"status": "success", "user": user.to_dict()}), 200
    return jsonify({"status": "error", "message": "еще не зашел :("}), 401


@all_api.route('/new_post', methods=['GET', 'POST'])
def new_post() -> Response | str:
    if 'user_id' not in session:
        return redirect(url_for('main.index'))
    if request.method == 'POST':
        user_id = session['user_id']
        content = request.form.get('content')
        image_file = request.files.get('image')
        filename = None
        if image_file and image_file.filename != '':
            filename = secure_filename(image_file.filename)
            name, ext = os.path.splitext(filename)
            filename = f"{name}_{os.urandom(4).hex()}{ext}"
            filepath = os.path.join(all_api.root_path, 'static', 'uploads', filename)
            os.makedirs(os.path.dirname(filepath), exist_ok=True)
            image_file.save(filepath)
            compress_photo(filepath)
        db_sess = db.create_session()
        new_post = Post(user_id=user_id, content=content, image=filename)
        db_sess.add(new_post)
        new_post.add_hashtags(session=db_sess)
        db_sess.commit()
        return redirect(url_for('main.lenta'))
    return render_template('new_post.html')


@all_api.route('/lenta')
def lenta() -> str:
    db_sess = db.create_session()
    posts = db_sess.query(Post).order_by(Post.id.desc()).all()
    return render_template('lenta.html', posts=posts)


@all_api.route('/hashtag/<tag_name>')
def hashtag_posts(tag_name: str) -> str:
    db_sess = db.create_session()
    hashtag = db_sess.query(Hashtag).filter(Hashtag.name == tag_name.lower()).first()
    posts = hashtag.posts if hashtag else []
    return render_template('lenta.html', posts=posts, hashtag=tag_name)


@all_api.route('/api/posts', methods=['GET'])
def get_posts() -> tuple[Response, int]:
    db_sess = db.create_session()
    tag = request.args.get('hashtag')
    if tag:
        hashtag = db_sess.query(Hashtag).filter(Hashtag.name == tag.lower()).first()
        posts = hashtag.posts
    else:
        posts = db_sess.query(Post).order_by(Post.id.desc()).all()
    return jsonify({"status": "success", "posts": [post.to_dict() for post in posts]}), 200


@all_api.route('/api/posts', methods=['POST'])
def create_post_api() -> tuple[Response, int]:
    if 'user_id' not in session:
        return jsonify({"status": "error", "message": "Сначала авторизуйтесь"}), 401

    data = request.get_json()
    content = data.get('content')
    if not content:
        return jsonify({"status": "error", "message": "выложи что то, а не пустоту"}), 400

    db_sess = db.create_session()
    new_post = Post(user_id=session['user_id'], content=content)
    db_sess.add(new_post)
    new_post.add_hashtags(session=db_sess)
    db_sess.commit()

    return jsonify({"status": "success", "post": new_post.to_dict()}), 201


@all_api.route("/")
def index() -> str:
    return render_template('index.html')


@all_api.route('/api/add_friend', methods=['POST'])
def add_friend() -> tuple[Response, int]:
    data = request.get_json()
    friend_name = data.get('username')
    db_sess = db.create_session()
    user_username = db_sess.get(User, session['user_id']).username
    if friend_name and friend_name != user_username:
        return jsonify({"status": "success", "message": f"{friend_name} отправлен запрос в друзья"}), 200
    elif friend_name and friend_name == user_username:
        return jsonify({"status": "error", "message": f"Зачем себя добавлять?"}), 400
    return jsonify({"status": "error", "message": "напиши сначала кого добавить"}), 400


@all_api.route('/api/find_user/<username>', methods=['GET'])
def find_user(username: str) -> tuple[Response, int]:
    db_sess = db.create_session()
    user = db_sess.query(User).filter(User.username == username).first()
    if not user:
        return jsonify({"status": "error", "message": "Пользователь не найден"}), 404
    return jsonify({"status": "success", "user": user.to_dict()}), 200


@all_api.route('/api/upload_avatar', methods=['POST'])
def upload_avatar() -> tuple[Response, int]:
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': 'Вы не вошли'}), 401

    image = request.files['avatar']
    filename = secure_filename(image.filename)
    name, ext = os.path.splitext(filename)
    filename = f"{name}_{os.urandom(4).hex()}{ext}"
    upload_folder = os.path.join(all_api.root_path, 'static', 'uploads')
    os.makedirs(upload_folder, exist_ok=True)
    filepath = os.path.join(upload_folder, filename)
    image.save(filepath)

    db_sess = db.create_session()
    user = db_sess.get(User, session['user_id'])
    avatar_url = '/static/uploads/' + filename
    user.avatar = avatar_url
    db_sess.commit()
    return jsonify({"status": "success", "message": "Успех", "avatar_url": avatar_url}), 200


@all_api.route('/api/update_profile', methods=['POST'])
def update_profile() -> tuple[Response, int]:
    if 'user_id' not in session:
        return jsonify({'status': 'error', 'message': 'Вы не вошли'}), 401
    data = request.get_json()
    new_name = data.get('name')
    new_username = data.get('username')
    new_discord = data.get('discord')
    new_telegram = data.get('telegram')
    db_sess = db.create_session()
    user = db_sess.get(User, session['user_id'])
    user.name = new_name
    user.username = new_username
    user.discord = new_discord
    user.telegram = new_telegram
    db_sess.commit()
    return jsonify({"status": 'success', 'message': 'Успех'}), 200


@all_api.route('/api/update_location', methods=['POST'])
def update_location() -> tuple[Response, int]:
    position = request.get_json()
    db_sess = db.create_session()
    user = db_sess.get(User, session['user_id'])
    user.geo_position = f"{position.get('lat')}, {position.get('lng')}"
    db_sess.commit()
    return jsonify({"status": 'success', 'message': 'Успех'}), 200