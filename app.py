import os
from pathlib import Path
from flask import Flask
import data.db_session as db
from main import all_api


DATABASE = Path("db/blink.db")

def create_app() -> Flask:
    klinb = Flask(__name__, static_folder='static')
    klinb.secret_key = "111"
    klinb.config['UPLOAD_FOLDER'] = os.path.join('static', 'uploads')
    klinb.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
    klinb.register_blueprint(all_api)
    return klinb


def main() -> None:
    db.init(DATABASE)
    app = create_app()
    app.run(host='', port=8080, debug=True)


if __name__ == '__main__':
    main()