import os
from pathlib import Path
from flask import Flask
import data.db_session as db
from main import all_api


DATABASE = Path("db/blink.db")

def create_app() -> Flask:
    app = Flask(__name__, static_folder='static')
    app.secret_key = "111"
    app.config['UPLOAD_FOLDER'] = os.path.join('static', 'uploads')
    app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
    app.register_blueprint(all_api)
    return app


def main() -> None:
    db.init(DATABASE)
    app = create_app()
    app.run()


if __name__ == '__main__':
    main()