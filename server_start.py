import os
from pathlib import Path
from secret import SECRET_KEY
from flask import Flask
import data.db_session as db
from apis import api
from pages import pages


DATABASE = Path("db/blink.db")


db.init(DATABASE)
app = Flask(__name__, static_folder='static')
app.secret_key = SECRET_KEY
app.config['UPLOAD_FOLDER'] = os.path.join('static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 2 * 1024 * 1024
app.register_blueprint(api)
app.register_blueprint(pages)
