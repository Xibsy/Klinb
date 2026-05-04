def requests_to_dict(friend):
    return {
        'id': friend.id,
        'name': friend.name,
        'username': friend.username,
        'avatar': friend.avatar,
    }