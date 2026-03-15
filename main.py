from flask import Flask, render_template, request, jsonify

klinb_app = Flask(__name__, static_folder='static')


@klinb_app.route("/")
def index():
    return render_template('index.html')


@klinb_app.route('/add_friend', methods=['POST'])
def add_friend():
    data = request.get_json()
    friend_name = data.get('name')

    if friend_name:
        print(f"\n[SERVER] Добавление нового друга: {friend_name}")
        return jsonify({
            "status": "success",
            "message": f"Друг {friend_name} успешно обработан сервером!"
        }), 200
    else:
        return jsonify({"status": "error", "message": "Имя не указано"}), 400

klinb_app.run(host='192.168.0.77', port=8080)