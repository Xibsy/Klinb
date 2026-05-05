def friend_to_point(friend) -> dict | None:
    try:
        point = {
        'pos': list(map(float, friend.geo_position.split(','))),
        'name': friend.name,
        'avatar': friend.avatar,
        'username': friend.username,
        'id': friend.id,
        'status': friend.status,
        'show_aaa': friend.show_aaa,
        'bio': friend.bio,
        'telegram': friend.telegram,
        'discord': friend.discord,
        }
        return point
    except AttributeError:
        return None

