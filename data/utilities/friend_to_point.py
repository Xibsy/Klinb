def friend_to_point(friend) -> dict | None:
    try:
        point = {
        'pos': list(map(float, friend.geo_position.split(','))),
        'name': friend.name,
        'avatar': friend.avatar,
        'username': friend.username,
        }
        return point
    except AttributeError:
        return None

