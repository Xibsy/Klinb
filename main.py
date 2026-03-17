import os
from flask import Flask, render_template, request, jsonify, redirect, url_for
from werkzeug.utils import secure_filename
from data.models.user import db, User
from data.models.post import Post
from data.utilities.compress_photo import compress_photo

klinb_app = Flask(__name__, static_folder='static')

klinb_app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///blink.db'
klinb_app.config['UPLOAD_FOLDER'] = os.path.join('static', 'uploads')
klinb_app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
db.init_app(klinb_app)


@klinb_app.route("/")
def index():
    return render_template('index.html')


@klinb_app.route('/add_friend', methods=['POST'])
def add_friend():
    data = request.get_json()
    friend_name = data.get('name')
    if friend_name:
        print(f"\n[SERVER] Добавление нового друга: {friend_name}")
        return jsonify({"status": "success", "message": f"Друг {friend_name} успешно обработан сервером!"}), 200
    else:
        return jsonify({"status": "error", "message": "Имя не указано"}), 400


@klinb_app.route('/new_post', methods=['GET', 'POST'])
def new_post():
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
        return redirect(url_for('lenta'))
    users = User.query.all()
    return render_template('new_post.html', users=users)


@klinb_app.route('/lenta')
def lenta():
    posts = Post.query.order_by(Post.created_at.desc()).all()
    return render_template('lenta.html', posts=posts)


if __name__ == '__main__':
    klinb_app.run(host='', port=8080)
