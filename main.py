import os
from pathlib import Path
from secret import SECRET_KEY
from flask import Flask
import data.db_session as db
from apis import api
from pages import pages


DATABASE = Path("db/blink.db")


def create_app() -> Flask:
    flask = Flask(__name__, static_folder='static')
    flask.secret_key = SECRET_KEY
    flask.config['UPLOAD_FOLDER'] = os.path.join('static', 'uploads')
    flask.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
    flask.register_blueprint(api)
    flask.register_blueprint(pages)
    return flask


def main() -> None:
    db.init(DATABASE)
    app = create_app()
    app.run(host='0.0.0.0', debug=True)


if __name__ == '__main__':
    main()