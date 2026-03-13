from flask import Flask, render_template

bio_site = Flask(__name__, static_folder='static')


@bio_site.route("/")
def index():
    return render_template('index.html')

bio_site.run(host='192.168.0.77', port=8080)